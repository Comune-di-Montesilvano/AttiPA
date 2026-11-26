import { Module } from '@nestjs/common';
import { TinnController } from './tinn.controller.js';
import { TinnService } from './tinn.service.js';

@Module({
  controllers: [TinnController],
  providers: [TinnService],
  exports: [TinnService],
})
export class TinnModule {}
