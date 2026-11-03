import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentRecovery from './PaymentRecovery';

const mocks = vi.hoisted(() => ({ status: vi.fn(), resume: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/api/payment-checkout', () => ({
  getPaymentCheckoutStatus: mocks.status,
  resumePaymentCheckout: mocks.resume,
}));
vi.mock('@/lib/payment-navigation', () => ({ redirectToPayMongo: mocks.redirect }));
beforeEach(() => {
  mocks.status
    .mockReset()
    .mockResolvedValue({ canResume: true, message: 'Continue payment for this existing order.' });
  mocks.resume
    .mockReset()
    .mockResolvedValue({ status: 'ready', checkoutUrl: 'https://checkout.paymongo.com/existing' });
  mocks.redirect.mockReset();
});
const view = () => render(<PaymentRecovery orderId="order-1" accessToken="token" />);

describe('Existing order payment recovery', () => {
  it('loads only local payment capabilities until the customer requests payment', async () => {
    view();
    expect(await screen.findByRole('button', { name: 'Continue payment' })).toBeEnabled();
    expect(mocks.status).toHaveBeenCalledWith('token', 'order-1', expect.any(AbortSignal));
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it('opens the existing checkout once and keeps the button locked during navigation', async () => {
    view();
    const user = userEvent.setup();
    await user.dblClick(await screen.findByRole('button', { name: 'Continue payment' }));
    await waitFor(() =>
      expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith('https://checkout.paymongo.com/existing'),
    );
    expect(mocks.resume).toHaveBeenCalledExactlyOnceWith('token', 'order-1');
    expect(screen.getByRole('button', { name: 'Opening payment checkout...' })).toBeDisabled();
  });

  it.each(['awaiting_confirmation', 'unavailable'])('never redirects for %s', async status => {
    mocks.resume.mockResolvedValue({
      status,
      message: 'Check your existing order before attempting another payment.',
    });
    view();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Continue payment' }));
    expect(
      await screen.findByText('Check your existing order before attempting another payment.'),
    ).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Continue payment' })).not.toBeInTheDocument();
  });

  it('shows safe retry information without automatically retrying a failed resume', async () => {
    mocks.resume.mockRejectedValue(new Error('Check this order before trying again.'));
    view();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Continue payment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check this order before trying again.');
    expect(mocks.resume).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('hides payment actions for cash orders', async () => {
    mocks.status.mockResolvedValue({ canResume: false, message: '' });
    view();
    await waitFor(() => expect(screen.queryByText('Checking payment options...')).not.toBeInTheDocument());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows manual review or disabled-provider information without a resume action', async () => {
    mocks.status.mockResolvedValue({ canResume: false, message: 'Contact the store for help.' });
    view();
    expect(await screen.findByText('Contact the store for help.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue payment' })).not.toBeInTheDocument();
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it('retries a failed capabilities request only when requested', async () => {
    mocks.status.mockRejectedValueOnce(new Error('Unable to check payment options.'));
    view();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to check payment options.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Check payment options again' }));
    expect(await screen.findByRole('button', { name: 'Continue payment' })).toBeEnabled();
    expect(mocks.status).toHaveBeenCalledTimes(2);
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it('ignores a late resume result after unmount', async () => {
    let resolve!: (value: unknown) => void;
    mocks.resume.mockReturnValue(
      new Promise(done => {
        resolve = done;
      }),
    );
    const mounted = view();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Continue payment' }));
    mounted.unmount();
    await act(async () =>
      resolve({ status: 'ready', checkoutUrl: 'https://checkout.paymongo.com/existing' }),
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
