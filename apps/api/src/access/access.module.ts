import { Global, Module } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { AccessService } from './access.service.js';

@Global()
@Module({
  providers: [AccessService, UsersService],
  exports: [AccessService, UsersService],
})
export class AccessModule {}
