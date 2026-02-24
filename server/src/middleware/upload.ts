import multer from 'multer';
import { ALLOWED_INVOICE_MIME_TYPES, ALLOWED_BANK_STATEMENT_MIME_TYPES, MAX_FILE_SIZE } from '@buchungsai/shared';
import { AppError } from '../utils/errors.js';

export const invoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_INVOICE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(422, 'INVALID_FILE_TYPE', `Dateityp ${file.mimetype} nicht erlaubt. Erlaubt: PDF, JPEG, PNG, TIFF, WebP`));
    }
  },
});

export const bankStatementUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const isCsvExtension = file.originalname.toLowerCase().endsWith('.csv') || file.originalname.toLowerCase().endsWith('.txt');
    if ((ALLOWED_BANK_STATEMENT_MIME_TYPES as readonly string[]).includes(file.mimetype) || (isCsvExtension && file.mimetype === 'application/octet-stream')) {
      cb(null, true);
    } else {
      cb(new AppError(422, 'INVALID_FILE_TYPE', `Dateityp ${file.mimetype} nicht erlaubt. Erlaubt: CSV, TXT`));
    }
  },
});
