import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from './ThemeProvider';
import { ThemeSwitch } from './ThemeSwitch';

let dark = false;
const listeners = new Set<(event: MediaQueryListEvent) => void>();

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
  dark = false;
  listeners.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: dark,
      media: query,
      onchange: null,
      addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderSwitch() {
  return render(
    <ThemeProvider>
      <ThemeSwitch />
    </ThemeProvider>,
  );
}
function changeSystem(value: boolean) {
  dark = value;
  act(() => {
    listeners.forEach((listener) => listener({ matches: value } as MediaQueryListEvent));
  });
}

describe('System-default sun and moon theme switch', () => {
  it.each([false, true])('starts with the system theme (dark=%s)', async (value) => {
    dark = value;
    renderSwitch();
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', value ? 'dark' : 'light'));
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', String(value));
    expect(screen.getByRole('button', { name: 'Dark mode' }).querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(
      2,
    );
  });

  it('follows system changes until the visitor chooses a theme', async () => {
    renderSwitch();
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
    changeSystem(true);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
    await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
    expect(window.localStorage.getItem('caffeinawa_theme')).toBe('light');
    changeSystem(false);
    changeSystem(true);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('persists keyboard selection and restores it after remounting', async () => {
    const user = userEvent.setup();
    const view = renderSwitch();
    const button = screen.getByRole('button', { name: 'Dark mode' });
    await waitFor(() => expect(button).toBeEnabled());
    button.focus();
    await user.keyboard(' ');
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
    expect(window.localStorage.getItem('caffeinawa_theme')).toBe('dark');
    view.unmount();
    renderSwitch();
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
  });

  it('synchronizes another tab’s saved selection', async () => {
    renderSwitch();
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
    act(() => {
      window.localStorage.setItem('caffeinawa_theme', 'dark');
      window.dispatchEvent(new StorageEvent('storage', { key: 'caffeinawa_theme', newValue: 'dark' }));
    });
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
  });

  it('uses the system preference when saved preferences cannot be read', async () => {
    dark = true;
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    renderSwitch();
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
    read.mockRestore();
  });
});
