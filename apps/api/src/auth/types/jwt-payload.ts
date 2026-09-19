export type CustomerRole = 'CUSTOMER' | 'ADMIN';

export interface JwtPayload {
  sub: string;
  email: string;
  role: CustomerRole;
}
