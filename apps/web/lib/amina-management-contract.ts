import { z } from 'zod';
const cents = z.number().int().min(0).max(100000000);
export const fixmitFinanceSchema = z.object({
    totalCents: cents.positive(), depositCents: cents, paidCents: cents, remainingCents: cents,
    currency: z.literal('EUR'), canSettleCash: z.boolean(), cashSettled: z.boolean(),
}).refine(value => value.paidCents + value.remainingCents === value.totalCents && value.depositCents <= value.paidCents);
export const fixmitDetailSchema = z.object({
    id: z.number().int().positive(), uid: z.string().min(1).max(100),
    invoiceKey: z.string().min(1).max(200), revision: z.string().regex(/^[a-f0-9]{64}$/),
    title: z.string(), startTime: z.string().datetime(), endTime: z.string().datetime(),
    status: z.enum(['ACCEPTED', 'PENDING', 'AWAITING_HOST', 'CANCELLED', 'REJECTED']),
    attendees: z.array(z.object({ name: z.string(), email: z.string(), phoneNumber: z.string().nullable() })),
    finance: fixmitFinanceSchema.nullable(), financialReview: z.string().nullable(),
    canCancel: z.boolean(), canReschedule: z.boolean(), canRecordFullCash: z.boolean().default(false), canWrite: z.boolean().optional(),
});
export type FixmitDetail = z.infer<typeof fixmitDetailSchema>;
const paymentSchema = z.object({ id: z.number().int().positive(), uid: z.string(), amount: cents, currency: z.string(), success: z.boolean(), refunded: z.boolean(), data: z.unknown(),appId:z.string().nullable().optional(),paymentOption:z.enum(['ON_BOOKING','HOLD']).nullable().optional() });
export function readFixmitFinancials(input: unknown, active: boolean) {
    const invalid = { finance: null, financialReview: 'Zahlungsstand nicht eindeutig. Bitte in Fixmit prüfen.', invoiceReference: null };
    const parsed = z.array(paymentSchema).safeParse(input);
    if (!parsed.success || parsed.data.length === 0)
        return { ...invalid, financialReview: 'Für diesen Termin liegt noch kein verlässlicher Preis- und Zahlungsnachweis vor.' };
    const rows = parsed.data;
    if(rows.some(row=>row.paymentOption==='HOLD'))return invalid;
    const cash=z.object({kind:z.literal('studio_cash'),totalAmount:cents.positive(),settlementMethod:z.literal('cash')}).safeParse(rows[0].data);
    if(rows.length===1&&cash.success&&(rows[0].appId===null||rows[0].appId===undefined)&&rows[0].success&&!rows[0].refunded&&rows[0].amount===cash.data.totalAmount&&rows[0].currency.toUpperCase()==='EUR')return {finance:{totalCents:rows[0].amount,depositCents:0,paidCents:rows[0].amount,remainingCents:0,currency:'EUR' as const,canSettleCash:false,cashSettled:true},financialReview:null,invoiceReference:`cash:${rows[0].uid}`};
    if(rows.some(row=>row.appId!==undefined&&row.appId!=='stripe'))return invalid;
    const deposits = rows.filter(row => z.object({ kind: z.literal('deposit'), totalAmount: cents.positive(), depositAmount: cents.positive() }).safeParse(row.data).success);
    if (deposits.length !== 1)
        return invalid;
    const deposit = deposits[0], snapshot = z.object({ totalAmount: cents.positive(), depositAmount: cents.positive() }).parse(deposit.data);
    const balances = rows.filter(row => z.object({ kind: z.literal('balance'), depositPaymentId: z.literal(deposit.id), totalAmount: z.literal(snapshot.totalAmount) }).safeParse(row.data).success);
    if (balances.length > 1 || rows.length !== 1 + balances.length || deposit.amount !== snapshot.depositAmount || deposit.amount >= snapshot.totalAmount || deposit.refunded || deposit.currency.toUpperCase() !== 'EUR')
        return invalid;
    const balance = balances[0];
    if (balance && (balance.refunded || balance.currency.toUpperCase() !== 'EUR' || balance.amount !== snapshot.totalAmount - deposit.amount || (!deposit.success && balance.success)))
        return invalid;
    const paidDeposit = deposit.success ? deposit.amount : 0, paid = paidDeposit + (balance?.success ? balance.amount : 0);
    const finance = { totalCents: snapshot.totalAmount, depositCents: paidDeposit, paidCents: paid, remainingCents: snapshot.totalAmount - paid, currency: 'EUR' as const, canSettleCash: active && deposit.success && !balance?.success, cashSettled: Boolean(balance?.success && z.object({ settlementMethod: z.literal('cash') }).safeParse(balance.data).success) };
    return { finance, financialReview: null, invoiceReference: `deposit:${deposit.uid}` };
}
export const fixmitManagementInput = z.discriminatedUnion('action', [
    z.object({action:z.literal('full_cash'),revision:z.string().regex(/^[a-f0-9]{64}$/),amountCents:cents.positive(),note:z.string().trim().min(5).max(300),confirmed:z.literal(true)}).strict(),
    z.object({ action: z.literal('cash'), revision: z.string().regex(/^[a-f0-9]{64}$/), amountCents: cents.positive(), confirmed: z.literal(true) }).strict(),
    z.object({ action: z.literal('cancel'), revision: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().min(3).max(500), confirmed: z.literal(true) }).strict(),
]);
export const fixmitInvoiceInput = z.object({
    revision: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true),
    recipient: z.object({ name: z.string().trim().min(1).max(200), street: z.string().trim().min(1).max(200), postalCode: z.string().trim().min(1).max(30), city: z.string().trim().min(1).max(120), country: z.enum(['AT','DE','CH','LI']) }).strict(),
}).strict();
export const fixmitInvoiceSchema = z.object({ id: z.string().uuid(), invoice_no: z.string(), issued_at: z.string(), snapshot: z.unknown() });
export function fixmitRescheduleUrl(uid: string) {
    // Nur die native Fixmit-Umbuchung kann Kalender, freie Plätze und Benachrichtigungen korrekt abgleichen.
    return `https://fixmit.com/reschedule/${encodeURIComponent(uid)}`;
}
export function parseFixmitCashAmount(value:string){
    if(!/^\d{1,6}(?:[.,]\d{1,2})?$/.test(value.trim()))throw Error('Bitte einen positiven Euro-Betrag mit höchstens zwei Nachkommastellen eingeben.');
    const result=Math.round(Number(value.trim().replace(',','.'))*100);
    return cents.positive().parse(result);
}
export function assertFixmitInvoiceReady(detail: FixmitDetail, revision: string) {
    if(!detail.title.trim())throw Error('Die Bezeichnung der Studio-Leistung fehlt. Bitte zuerst in Fixmit pflegen.');
    if (detail.revision !== revision)
        throw Error('Der Termin wurde inzwischen geändert. Bitte neu laden.');
    if (detail.status !== 'ACCEPTED' || !detail.finance || detail.financialReview || detail.finance.remainingCents !== 0)
        throw Error('Eine Studio-Rechnung ist nur für bestätigte und vollständig bezahlte Termine mit geklärtem Zahlungsstand möglich.');
}
