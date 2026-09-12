const dashboardHandler = require('./dashboard');

module.exports = async function handler(req, res) {
  const originalJson = res.json.bind(res);

  res.json = function safeDashboardJson(payload) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, 'details')) {
      const { details, ...safePayload } = payload;
      return originalJson(safePayload);
    }
    return originalJson(payload);
  };

  return dashboardHandler(req, res);
};
