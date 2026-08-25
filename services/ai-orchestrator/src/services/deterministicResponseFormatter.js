function unwrapData(value) {
  let current = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, 'data')) {
      break;
    }
    current = current.data;
  }
  return current;
}

function toolData(toolResults, ...toolNames) {
  for (const name of toolNames) {
    if (toolResults && Object.prototype.hasOwnProperty.call(toolResults, name)) {
      return unwrapData(toolResults[name]);
    }
  }
  return null;
}

function money(value, currency = 'USD') {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? `${currency || 'USD'} ${numeric.toFixed(2)}`
    : 'an unavailable amount';
}

function accountLabel(account) {
  const name = account.account_name || account.accountName || account.account_type || account.accountType || 'Account';
  const number = account.account_number || account.accountNumber || account.account_id || account.accountId || '';
  const suffix = number ? ` ending in ${String(number).slice(-4)}` : '';
  return `${name}${suffix}`;
}

function formatAccounts(accounts, includeDetails = false) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return 'I could not find any banking accounts linked to your authenticated profile.';
  }

  const lines = accounts.map((account) => {
    const currency = account.currency || 'USD';
    const balance = money(account.balance, currency);
    const available = account.available_balance ?? account.availableBalance;
    const availableText = available === undefined || available === null
      ? ''
      : `; available ${money(available, currency)}`;
    const status = includeDetails && account.status ? `; status ${account.status}` : '';
    return `- ${accountLabel(account)}: ${balance}${availableText}${status}`;
  });

  return `Here ${accounts.length === 1 ? 'is' : 'are'} your ${accounts.length === 1 ? 'account' : 'accounts'}:\n${lines.join('\n')}`;
}

function formatList(label, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `I did not find any ${label} for your authenticated profile.`;
  }
  return `I found ${items.length} ${label}.`;
}

function formatDeterministicResponse({ intent, collectedData = {}, toolResults = {} }) {
  switch (intent) {
    case 'balance_inquiry': {
      const accounts = toolData(toolResults, 'banking_get_accounts');
      if (Array.isArray(accounts)) return formatAccounts(accounts);
      const balance = toolData(toolResults, 'banking_get_balance') || {};
      return `Your current balance is ${money(balance.balance, balance.currency)}${
        balance.available_balance !== undefined
          ? `, with ${money(balance.available_balance, balance.currency)} available`
          : ''
      }.`;
    }
    case 'account_info': {
      const accounts = toolData(toolResults, 'banking_get_accounts');
      if (Array.isArray(accounts)) return formatAccounts(accounts, true);
      const account = toolData(toolResults, 'banking_get_account');
      return account ? formatAccounts([account], true) : formatAccounts([]);
    }
    case 'transaction_history':
      return formatList('transactions', toolData(toolResults, 'banking_get_transactions'));
    case 'payment_inquiry': {
      const transfers = toolData(toolResults, 'banking_get_transfers');
      if (Array.isArray(transfers)) return formatList('payments or transfers', transfers);
      const transfer = toolData(toolResults, 'banking_get_transfer');
      return transfer
        ? `Transfer ${transfer.reference_number || transfer.transferId || collectedData.transferId || ''} is ${transfer.status || 'available for review'}.`.trim()
        : 'I could not find that payment or transfer.';
    }
    case 'account_statement':
      return 'Your requested account statement is ready from the banking service.';
    case 'transfer_funds':
      return `Your transfer of ${money(collectedData.amount, collectedData.currency)} was submitted successfully.`;
    case 'card_management':
    case 'card_activation':
    case 'card_replacement': {
      const cards = toolData(toolResults, 'banking_get_cards');
      if (Array.isArray(cards)) return formatList('cards', cards);
      return `Your card ${collectedData.cardAction || intent.replace('card_', '')} request completed successfully.`;
    }
    case 'dispute_transaction':
      return 'Your transaction dispute was submitted successfully.';
    case 'report_fraud':
      return 'Your fraud report was submitted successfully and marked for review.';
    case 'check_fraud_alerts':
      return formatList('fraud alerts', toolData(toolResults, 'banking_get_fraud_alerts'));
    case 'verify_transaction':
      return 'Your transaction verification was recorded successfully.';
    case 'help':
      return 'I can help with balances, transactions, transfers, cards, statements, fraud alerts, disputes, and account information.';
    case 'complaint':
      return 'I have the complaint details needed to route your request to support.';
    case 'general_inquiry':
    default:
      return 'I can help with your banking accounts, transactions, transfers, cards, fraud concerns, or disputes. What would you like to do?';
  }
}

module.exports = {
  formatDeterministicResponse,
  unwrapData
};
