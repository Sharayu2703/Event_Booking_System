import type { Types } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: Types.ObjectId;
        id: string;
        name: string;
        email: string;
        role: 'CUSTOMER' | 'ORGANIZER';
      };
    }
  }
}

export {};
