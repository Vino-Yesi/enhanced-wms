"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = void 0;
require("dotenv/config");
const app_1 = require("./app");
const PORT = parseInt(process.env.PORT || '4000');
const app = (0, app_1.createApp)();
const server = app.listen(PORT, () => {
    console.log(`[wms-backend] listening on http://localhost:${PORT}/api (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
});
exports.server = server;
// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
        console.log(`[wms-backend] ${sig} received, shutting down`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 5000).unref();
    });
}
