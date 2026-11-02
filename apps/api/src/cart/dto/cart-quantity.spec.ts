import 'reflect-metadata';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AddCartItemDto } from './add-cart-item.dto.js';
import { UpdateCartItemDto } from './update-cart-item.dto.js';

describe('Cart quantity DTOs', () => {
  for (const Dto of [AddCartItemDto, UpdateCartItemDto]) {
    it.each([1, 99])(`${Dto.name} accepts quantity %s`, async (quantity) => {
      const dto = Object.assign(new Dto(), {
        coffeeId: '00000000-0000-4000-8000-000000000001',
        quantity,
      });
      expect(await validate(dto)).toEqual([]);
    });
    it.each([0, -1, 1.5, 100, '99', null, undefined])(
      `${Dto.name} rejects quantity %s`,
      async (quantity) => {
        const dto = Object.assign(new Dto(), {
          coffeeId: '00000000-0000-4000-8000-000000000001',
          quantity,
        });
        expect(
          (await validate(dto)).some((error) => error.property === 'quantity'),
        ).toBe(true);
      },
    );
  }
});
