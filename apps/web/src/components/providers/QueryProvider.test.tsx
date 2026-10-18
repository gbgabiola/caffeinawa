import { useMutation, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import QueryProvider from './QueryProvider';

interface QueryProbeProps {
  load: () => Promise<string>;
}

function QueryProbe({ load }: QueryProbeProps) {
  const query = useQuery({
    queryKey: ['query-provider-test'],
    queryFn: load,
    // Keep tests fast while inheriting the provider's retry count.
    retryDelay: 0,
  });

  if (query.isPending) {
    return <p>Loading result...</p>;
  }

  if (query.isError) {
    return <p role="alert">{query.error.message}</p>;
  }

  return <p>{query.data}</p>;
}

interface MutationProbeProps {
  save: () => Promise<string>;
}

function MutationProbe({ save }: MutationProbeProps) {
  const mutation = useMutation({
    mutationFn: save,
    // A regression enabling retries should also fail quickly.
    retryDelay: 0,
  });

  return (
    <div>
      <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        Save
      </button>

      {mutation.isError && <p role="alert">{mutation.error.message}</p>}

      {mutation.isSuccess && <p>{mutation.data}</p>}
    </div>
  );
}

describe('QueryProvider retry policy', () => {
  it('retries a failed query once and displays the recovered result', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce('Recovered result');

    render(
      <QueryProvider>
        <QueryProbe load={load} />
      </QueryProvider>,
    );

    expect(screen.getByText('Loading result...')).toBeInTheDocument();

    expect(await screen.findByText('Recovered result')).toBeInTheDocument();

    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stops after the initial query attempt and one retry', async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('Service unavailable'));

    render(
      <QueryProvider>
        <QueryProbe load={load} />
      </QueryProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not automatically retry a failed mutation', async () => {
    const user = userEvent.setup();

    const save = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('Review request failed'));

    render(
      <QueryProvider>
        <MutationProbe save={save} />
      </QueryProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Review request failed');

    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
