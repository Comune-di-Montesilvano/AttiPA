import { Test } from '@nestjs/testing';
import { AppController } from './app.controller.js';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [AppController] }).compile();
    controller = moduleRef.get(AppController);
  });

  afterEach(() => {
    delete process.env['APP_VERSION'];
  });

  it('risponde OK sulla root', () => {
    expect(controller.getHealth()).toBe('OK');
  });

  it('restituisce APP_VERSION, dev se assente', () => {
    expect(controller.getVersion()).toEqual({ version: 'dev' });
    process.env['APP_VERSION'] = 'v0.1.0';
    expect(controller.getVersion()).toEqual({ version: 'v0.1.0' });
  });
});
