import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validateBody } from '../middleware/validate.js';
import {
  createEmailConnectorSchema,
  updateEmailConnectorSchema,
  testEmailConnectorSchema,
} from '@buchungsai/shared';
import * as connectorService from '../services/emailConnector.service.js';

const router = Router();

// Alle Endpoints brauchen Auth + Tenant
router.use(authenticate, requireTenant);

// GET /api/v1/email-connectors — Liste aller Connectors
router.get('/', async (req, res, next) => {
  try {
    const connectors = await connectorService.listConnectors(req.tenantId!);
    res.json({ success: true, data: connectors });
  } catch (err) { next(err); }
});

// POST /api/v1/email-connectors — Neuen Connector erstellen (nur ADMIN)
router.post('/', requireRole('ADMIN'), validateBody(createEmailConnectorSchema), async (req, res, next) => {
  try {
    const connector = await connectorService.createConnector(req.tenantId!, req.userId!, req.body);
    res.status(201).json({ success: true, data: connector });
  } catch (err) { next(err); }
});

// POST /api/v1/email-connectors/test — IMAP-Verbindung testen
router.post('/test', validateBody(testEmailConnectorSchema), async (req, res, next) => {
  try {
    const result = await connectorService.testConnection(req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/v1/email-connectors/:id — Einzelner Connector
router.get('/:id', async (req, res, next) => {
  try {
    const connector = await connectorService.getConnector(req.tenantId!, req.params.id as string);
    res.json({ success: true, data: connector });
  } catch (err) { next(err); }
});

// PUT /api/v1/email-connectors/:id — Connector aktualisieren (nur ADMIN)
router.put('/:id', requireRole('ADMIN'), validateBody(updateEmailConnectorSchema), async (req, res, next) => {
  try {
    const connector = await connectorService.updateConnector(req.tenantId!, req.params.id as string, req.body);
    res.json({ success: true, data: connector });
  } catch (err) { next(err); }
});

// DELETE /api/v1/email-connectors/:id — Connector löschen (nur ADMIN)
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await connectorService.deleteConnector(req.tenantId!, req.userId!, req.params.id as string);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// POST /api/v1/email-connectors/:id/sync — Manuellen Sync auslösen
router.post('/:id/sync', async (req, res, next) => {
  try {
    await connectorService.triggerSync(req.tenantId!, req.params.id as string);
    res.json({ success: true, data: { message: 'Synchronisation gestartet' } });
  } catch (err) { next(err); }
});

export default router;
