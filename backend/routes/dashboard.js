const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/summary', (req, res) => {
  try {
    const { from_date, to_date } = req.query;

    // Default to current month if no dates provided
    let dateFilter = '';
    let dateParams = [];

    if (from_date && to_date) {
      dateFilter = ' AND date >= ? AND date <= ?';
      dateParams = [from_date, to_date];
    } else if (from_date) {
      dateFilter = ' AND date >= ?';
      dateParams = [from_date];
    } else if (to_date) {
      dateFilter = ' AND date <= ?';
      dateParams = [to_date];
    }

    const accounts = db.prepare('SELECT id, opening_balance FROM accounts WHERE user_id = ?').all(req.userId);

    let totalBalance = 0;
    accounts.forEach(acc => {
      const incoming = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
        WHERE to_account_id = ? AND type IN ('income', 'transfer', 'payable')
      `).get(acc.id).total;

      const outgoing = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
        WHERE from_account_id = ? AND type IN ('expense', 'transfer', 'receivable')
      `).get(acc.id).total;

      totalBalance += acc.opening_balance + incoming - outgoing;
    });

    // Time-based income/expense
    const totalIncome = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE user_id = ? AND type = 'income' ${dateFilter}
    `).get(req.userId, ...dateParams).total;

    const totalExpense = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE user_id = ? AND type = 'expense' ${dateFilter}
    `).get(req.userId, ...dateParams).total;

    const totalReceivable = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE user_id = ? AND type = 'receivable' ${dateFilter}
    `).get(req.userId, ...dateParams).total;

    const totalPayable = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE user_id = ? AND type = 'payable' ${dateFilter}
    `).get(req.userId, ...dateParams).total;

    const recentTransactions = db.prepare(`
      SELECT t.*, 
        fa.name as from_account_name,
        ta.name as to_account_name,
        fp.name as from_person_name,
        tp.name as to_person_name
      FROM transactions t
      LEFT JOIN accounts fa ON fa.id = t.from_account_id
      LEFT JOIN accounts ta ON ta.id = t.to_account_id
      LEFT JOIN people fp ON fp.id = t.from_person_id
      LEFT JOIN people tp ON tp.id = t.to_person_id
      WHERE t.user_id = ?
      ORDER BY t.date DESC, t.created_at DESC
      LIMIT 10
    `).all(req.userId);

    const accountBreakdown = accounts.map(acc => {
      const incoming = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
        WHERE to_account_id = ? AND type IN ('income', 'transfer', 'payable')
      `).get(acc.id).total;

      const outgoing = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
        WHERE from_account_id = ? AND type IN ('expense', 'transfer', 'receivable')
      `).get(acc.id).total;

      return {
        id: acc.id,
        balance: acc.opening_balance + incoming - outgoing
      };
    });

    res.json({
      total_balance: totalBalance,
      total_income: totalIncome,
      total_expense: totalExpense,
      total_receivable: totalReceivable,
      total_payable: totalPayable,
      net_worth: totalBalance + totalReceivable - totalPayable,
      recent_transactions: recentTransactions,
      account_breakdown: accountBreakdown,
      date_range: { from_date: from_date || null, to_date: to_date || null }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
