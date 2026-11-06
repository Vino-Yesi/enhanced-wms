import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Router } from 'express';

const options: swaggerJsdoc.Options = {
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

const specs = swaggerJsdoc(options);
const router = Router();

router.use('/', swaggerUi.serve, swaggerUi.setup(specs, { customSiteTitle: 'Enhanced WMS API Docs' }));

export default router;
