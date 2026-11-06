"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const express_1 = require("express");
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Enhanced WMS API',
            version: '1.0.0',
            description: 'Frozen API contract v1. All routes under /api. Auth via Bearer JWT.',
        },
        servers: [{ url: '/api' }],
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: [], // routes are code-generated; full reference in API.md
};
const specs = (0, swagger_jsdoc_1.default)(options);
const router = (0, express_1.Router)();
router.use('/', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(specs, { customSiteTitle: 'Enhanced WMS API Docs' }));
exports.default = router;
