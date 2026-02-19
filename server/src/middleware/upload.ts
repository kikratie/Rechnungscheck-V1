import multer from 'multer';
import { ALLOWED_INVOICE_MIME_TYPES, MAX_FILE_SIZE } from '@buchungsai/shared';
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
