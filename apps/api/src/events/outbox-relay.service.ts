import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { DATABASE, type Database } from '../db/database.js';
import { drainOutbox, type OutboxEvent } from './outbox.js';

/**
 * Travailleur de l'outbox, dans le processus de l'API (ADR-011). Pour l'instant, le seul
 * destinataire est le journal technique ; badges, tableaux de bord et notifications s'y
 * brancheront. `OUTBOX_RELAY_INTERVAL_MS=0` le désactive (tests).
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Outbox');
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  onApplicationBootstrap(): void {
    const interval = Number(process.env.OUTBOX_RELAY_INTERVAL_MS ?? 2000);
    if (!Number.isFinite(interval) || interval <= 0) return;
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await drainOutbox(this.db, async (event) => this.deliver(event));
    } catch (error) {
      this.logger.warn(`Livraison interrompue : ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async deliver(event: OutboxEvent): Promise<void> {
    this.logger.log(`${event.eventType} ${event.id}`);
  }
}
