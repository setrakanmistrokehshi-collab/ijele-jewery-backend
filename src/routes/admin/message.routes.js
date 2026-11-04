import { Router } from 'express';
import { deleteMessage, listMessages, setMessageHandled } from '../../controllers/contact.controller.js';

export const adminMessageRouter = Router();

adminMessageRouter.get('/', listMessages);
adminMessageRouter.patch('/:id', setMessageHandled);
adminMessageRouter.delete('/:id', deleteMessage);
