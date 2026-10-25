import { createHash, randomUUID } from 'node:crypto';
import prisma from '@calcom/prisma';
import { studioAccountRateLimit } from '@calcom/features/auth/lib/studioAccountSecurity';
import { billingEnabled, entitled } from '@lib/fixmitBilling';
import { bookingBalance } from '@calcom/app-store/stripepayment/lib/bookingBalance';
import handleCancelBooking from '@calcom/features/bookings/lib/handleCancelBooking';
import {prepareAminaReschedulePayments} from '@lib/prepareAminaReschedulePayments';
import { fixmitManagementInput, readFixmitFinancials } from '@lib/amina-management-contract';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
async function ownerFor(request: Request, write: boolean) {
    if (process.env.FIXMIT_AMINA_READ_ENABLED !== 'true' || process.env.FIXMIT_AMINA_MANAGEMENT_ENABLED !== 'true' || (write && process.env.FIXMIT_AMINA_WRITE_ENABLED !== 'true'))
        return null;
    if (!await studioAccountRateLimit('amina-management', request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown', write ? 20 : 120))
        return null;
    const owner = await prisma.user.findFirst({ where: { username: 'azbeauty', locked: false }, select: { id: true, email: true } });
    if (!owner || (billingEnabled() && !await entitled(owner.id)))
        return null;
    const prefix = process.env.API_KEY_PREFIX ?? 'cal_', header = request.headers.get('authorization') || '';
    const key = header.startsWith(`Bearer ${prefix}`) ? header.slice(7 + prefix.length) : '';
    if (!/^[a-f0-9]{32}$/.test(key))
        return null;
    const access = await prisma.apiKey.findUnique({ where: { hashedKey: createHash('sha256').update(key).digest('hex') }, select: { userId: true, teamId: true, expiresAt: true } });
    return access && access.userId === owner.id && access.teamId === null && (!access.expiresAt || access.expiresAt > new Date()) ? owner : null;
}
async function read(id: number, userId: number) {
    const booking = await prisma.booking.findFirst({ where: { id, userId }, select: { id: true, uid: true, title: true, startTime: true, endTime: true, status: true, paid: true, rescheduled: true, fromReschedule: true, recurringEventId: true, eventType: { select: { disableCancelling: true, disableRescheduling: true, seatsPerTimeSlot: true } }, attendees: { select: { name: true, email: true, phoneNumber: true } }, payment: { orderBy: { id: 'asc' }, select: { id: true, uid: true, amount: true, currency: true, success: true, refunded: true, data: true, externalId: true,appId:true,paymentOption:true } } } });
    if (!booking)
        return null;
    const revision = createHash('sha256').update(JSON.stringify(booking)).digest('hex');
    const active = booking.status === 'ACCEPTED' && !booking.rescheduled;
    const financial = readFixmitFinancials(booking.payment, active);
    const simple = !booking.recurringEventId && !booking.eventType?.seatsPerTimeSlot;
    const cancellable=!booking.rescheduled&&['ACCEPTED','PENDING','AWAITING_HOST'].includes(booking.status);
    return {
        id:booking.id,uid:booking.uid,title:booking.title,
        startTime:booking.startTime.toISOString(),endTime:booking.endTime.toISOString(),
        status:booking.status,attendees:booking.attendees,revision,
        invoiceKey:`azbeauty:${financial.invoiceReference??'booking:'+booking.uid}`,
        finance:financial.finance,financialReview:financial.financialReview,
        canRecordFullCash:active&&simple&&!booking.paid&&booking.payment.length===0,
        canCancel:cancellable&&simple&&(!booking.payment.length||Boolean(financial.finance))&&!booking.eventType?.disableCancelling,
        canReschedule:active&&simple&&(!booking.payment.length||Boolean(financial.finance))&&!booking.eventType?.disableRescheduling,
        canWrite:process.env.FIXMIT_AMINA_WRITE_ENABLED==='true',
    };
}
async function handle(request: Request, write: boolean) {
    const owner = await ownerFor(request, write);
    if (!owner)
        return reply({ error: 'Not available' }, 403);
    const idText = new URL(request.url).searchParams.get('bookingId') || '';
    if (!/^[1-9]\d{0,9}$/.test(idText))
        return reply({ error: 'Invalid booking' }, 400);
    try {
        const detail = await read(Number(idText), owner.id);
        if (!detail)
            return reply({ error: 'Not found' }, 404);
        if (!write)
            return reply(detail);
        const parsed = fixmitManagementInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
            return reply({ error: 'Invalid action' }, 400);
        const body = parsed.data;
        if (body.revision !== detail.revision)
            return reply({ error: 'Version conflict' }, 409);
        if (body.action === 'cash') {
            if (!detail.finance?.canSettleCash || body.amountCents !== detail.finance.remainingCents)
                return reply({ error: 'Payment conflict' }, 409);
            // Erwartungswerte werden unter derselben Zahlungssperre im bestehenden Helper geprüft.
            await bookingBalance(detail.uid, owner.id, 'studio', { expected: { total: detail.finance.totalCents, paid: detail.finance.paidCents, remaining: body.amountCents }, studioMethod: 'cash' });
        }
        else if(body.action==='full_cash'){
            if(!detail.canRecordFullCash)return reply({error:'Payment needs review'},409);
            await prisma.$transaction(async tx=>{
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(73125, ${detail.id})`;
                const locked=await tx.booking.findFirst({where:{id:detail.id,userId:owner.id,paid:false,status:'ACCEPTED'},select:{id:true,payment:{select:{id:true}}}});
                if(!locked||locked.payment.length)throw Error('Payment changed');
                const latest=await read(detail.id,owner.id);
                if(!latest?.canRecordFullCash||latest.revision!==body.revision)throw Error('Version conflict');
                await tx.payment.create({data:{uid:randomUUID(),externalId:`amina_cash_${detail.uid}`,bookingId:detail.id,appId:null,amount:body.amountCents,currency:'eur',fee:0,success:true,refunded:false,paymentOption:'ON_BOOKING',data:{kind:'studio_cash',totalAmount:body.amountCents,method:'studio',settlementMethod:'cash',settledAt:new Date().toISOString(),settledBy:owner.id,priceNote:body.note}}});
                await tx.booking.update({where:{id:detail.id},data:{paid:true}});
            },{isolationLevel:'Serializable',timeout:15000,maxWait:10000});
        }
        else {
            if (!detail.canCancel)
                return reply({ error: 'Cancellation unavailable' }, 409);
            // Serverinterne Option; niemals aus dem öffentlichen Buchungs-Body lesen.
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(73125, ${detail.id})`;
                const latest = await read(detail.id, owner.id);
                if (!latest?.canCancel || latest.revision !== body.revision)
                    throw Error('Version conflict');
                await prepareAminaReschedulePayments(tx,detail.id,owner.id,'cancel');
                const result = await handleCancelBooking({ userId: owner.id, bookingData: { uid: detail.uid, cancellationReason: body.reason, cancelledBy: owner.email, allRemainingBookings: false }, skipPaymentActions: true });
                if (!result.success)
                    throw Error('Cancellation not confirmed');
            }, { timeout: 60000, maxWait: 10000 });
        }
        const result = await read(detail.id, owner.id);
        if (!result)
            throw Error('Missing result');
        if(body.action==='cancel'&&result.status!=='CANCELLED')throw Error('Cancellation not confirmed');
        if(body.action!=='cancel'&&(!result.finance?.cashSettled||result.finance.remainingCents!==0||result.finance.totalCents!==(body.action==='full_cash'?body.amountCents:detail.finance?.totalCents)))throw Error('Cash settlement not confirmed');
        return reply(result);
    }
    catch {
        return reply({ error: 'Action not confirmed; reload before retrying' }, 409);
    }
}
export const GET = (request: Request) => handle(request, false);
export const PATCH = (request: Request) => handle(request, true);
