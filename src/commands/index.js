import { moderationCommands } from './moderation.js';
import { presentationCommands } from './presentation.js';
import { ticketCommands } from './tickets.js';

export const commands = [...moderationCommands, ...presentationCommands, ...ticketCommands];
