type MpesaPayerRole = 'resident' | 'recycler';

const normalize = (value?: string | null) =>
  String(value || '').trim().toLowerCase();

export const getMpesaFailureMessage = (
  payment: {
    resultDesc?: string;
    responseDescription?: string;
    customerMessage?: string;
  },
  payerRole: MpesaPayerRole
) => {
  const raw =
    payment.resultDesc ||
    payment.responseDescription ||
    payment.customerMessage ||
    '';
  const message = normalize(raw);
  const payerLabel = payerRole === 'recycler' ? 'recycler' : 'resident';

  if (!message) {
    return `M-Pesa payment was not completed. Ask the ${payerLabel} to try again.`;
  }

  if (message.includes('insufficient') || message.includes('balance')) {
    return `M-Pesa payment was not completed because the ${payerLabel}'s M-Pesa balance is insufficient.`;
  }

  if (message.includes('cancel') || message.includes('request cancelled')) {
    return `M-Pesa payment was cancelled by the ${payerLabel}.`;
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return `M-Pesa payment timed out before the ${payerLabel} approved it. Send the STK push again.`;
  }

  if (message.includes('pin') || message.includes('invalid initiator') || message.includes('initiator information')) {
    return `M-Pesa rejected the payment after the ${payerLabel} prompt. Confirm the ${payerLabel}'s PIN/balance and try again.`;
  }

  if (message.includes('invalid') && message.includes('phone')) {
    return `M-Pesa payment was not sent because the ${payerLabel}'s phone number is invalid.`;
  }

  return raw || `M-Pesa payment was not completed. Ask the ${payerLabel} to try again.`;
};
