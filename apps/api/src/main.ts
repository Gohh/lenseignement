import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { loadConfig } from './config.js';
import { loadRootEnv } from './load-env.js';

async function main(): Promise<void> {
  loadRootEnv();
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.API_PORT);
}

void main();
