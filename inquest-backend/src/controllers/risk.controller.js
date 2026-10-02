const { listRisk } = require('../services/riskEngine');

function getRiskBoard(req, res) {
  res.status(200).json({ success: true, data: { customers: listRisk() } });
}

module.exports = { getRiskBoard };
