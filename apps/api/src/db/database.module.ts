import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { loadConfig } from '../config.js';
import { createDatabase, DATABASE, type Database } from './database.js';

@Injectable()
class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async onModuleDestroy(): Promise<void> {
    await this.db.$client.end();
  }
}

@Global()
@Module({
  providers: [
    { provide: DATABASE, useFactory: () => createDatabase(loadConfig().DATABASE_URL) },
    DatabaseLifecycle,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
