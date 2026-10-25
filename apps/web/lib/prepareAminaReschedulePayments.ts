import process from 'node:process';
import {randomUUID} from 'node:crypto';
import type { Prisma } from '@calcom/prisma/client';
import { readFixmitFinancials } from '@lib/amina-management-contract';
import { bookingStripeData, verifyBookingIntent } from '@calcom/app-store/stripepayment/lib/bookingPayment';
import { assertStripeBookingAccount, stripeBookingLiveMode } from '@calcom/app-store/stripepayment/lib/bookingConfig';
import stripe from '@calcom/app-store/stripepayment/lib/server';
/** Nur Amina: Anzahlung UND Restzahlung gemeinsam übernehmen; offene Online-Zahlung vorher sicher schließen. */
export async function prepareAminaReschedulePayments(tx: Prisma.TransactionClient, id: number, userId: number, mode:'reschedule'|'cancel'='reschedule') {
    if (process.env.FIXMIT_AMINA_MANAGEMENT_ENABLED !== 'true')
        return null;
    const owner = await tx.user.findFirst({ where: { id: userId, username: 'azbeauty' }, select: { id: true } });
    if (!owner)
        return null;
    await tx.$executeRaw `SELECT pg_advisory_xact_lock(73125, ${id})`;
    const booking = await tx.booking.findFirst({ where: { id, userId }, select: { status: true, rescheduled: true, paid: true } });
    if (!booking || !(mode==='cancel'?['ACCEPTED','PENDING','AWAITING_HOST'].includes(booking.status):booking.status==='ACCEPTED') || booking.rescheduled)
        throw Error('Booking changed; reload before rescheduling');
    const payments = await tx.payment.findMany({ where: { bookingId: id }, orderBy: { id: 'asc' } });
    if (!payments.length)
        return null;
    const managed=payments.some(payment=>payment.data&&typeof payment.data==='object'&&!Array.isArray(payment.data)&&['deposit','studio_cash'].includes(String(payment.data.kind)));
    if(!managed)return null;
    const state = readFixmitFinancials(payments, true);
    if (!state.finance || (mode==='reschedule'&&((!state.finance.depositCents&&!state.finance.cashSettled) || !booking.paid)))
        throw Error('Payment needs review before rescheduling');
    for (const payment of payments) {
        if (payment.success || payment.refunded)
            continue;
        if(payment.externalId.startsWith('pi_')){
            const credentials = bookingStripeData.parse(payment.data);
            assertStripeBookingAccount(credentials.stripeAccount, userId);
            const intent = await stripe.paymentIntents.retrieve(payment.externalId, {}, { stripeAccount: credentials.stripeAccount });
            verifyBookingIntent(intent, { ...payment, bookingId: id }, stripeBookingLiveMode());
            if (['succeeded', 'processing'].includes(intent.status))
                throw Error('Online payment is processing; reload before rescheduling');
            if (intent.status !== 'canceled')
                await stripe.paymentIntents.cancel(intent.id, {}, { stripeAccount: credentials.stripeAccount });
        }
        // Keinen alten Zahlungs-Intent übernehmen. Eine neue Link-Generation bekommt einen passenden Intent.
        const previousData=payment.data&&typeof payment.data==='object'&&!Array.isArray(payment.data)?payment.data:{};
        await tx.payment.update({ where: { id: payment.id }, data: { externalId: `${mode==='cancel'?'amina_cancelled':'balance_pending'}_${payment.uid}`,...(mode==='reschedule'?{data:{...previousData,balanceIntentVersion:randomUUID()}}:{}) } });
    }
    return {payments:payments.map(payment => ({ id: payment.id })),paid:booking.paid};
}
