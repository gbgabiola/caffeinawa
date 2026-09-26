'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/components/auth/AuthProvider';
import { getAdminCustomers, updateAdminCustomer, type AdminCustomer } from '@/lib/api/admin-customers';

interface CustomerFormState {
  name: string;
  email: string;
}

export default function AdminCustomersPage() {
  const { accessToken, customer, isLoading } = useAuth();

  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormState>({
    name: '',
    email: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !accessToken || customer?.role !== 'ADMIN') {
      return;
    }

    let cancelled = false;

    getAdminCustomers(accessToken)
      .then(data => {
        if (cancelled) {
          return;
        }

        setCustomers(data);
        setError(null);
        setFetchState('success');
      })
      .catch(error => {
        if (cancelled) {
          return;
        }

        setError(error instanceof Error ? error.message : 'Unable to load customers.');
        setFetchState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, customer?.role, isLoading]);

  const isFetching = fetchState === 'idle' || fetchState === 'loading';

  if (isLoading) {
    return (
      <div className="px-6 py-8 lg:px-8">
        <p className="text-sm text-gray-600">Checking admin access...</p>
      </div>
    );
  }

  if (!customer || customer.role !== 'ADMIN') {
    return null;
  }

  function startEditing(item: AdminCustomer) {
    setEditingCustomerId(item.id);
    setForm({
      name: item.name,
      email: item.email,
    });
    setSaveError(null);
    setSaveSuccess(null);
  }

  function cancelEditing() {
    setEditingCustomerId(null);
    setForm({
      name: '',
      email: '',
    });
    setSaveError(null);
    setSaveSuccess(null);
  }

  async function handleSave() {
    if (!accessToken || !editingCustomerId) {
      return;
    }

    const name = form.name.trim();
    const email = form.email.trim();

    if (!name || !email) {
      setSaveError('Name and email are required.');
      setSaveSuccess(null);
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const updatedCustomer = await updateAdminCustomer(accessToken, editingCustomerId, {
        name,
        email,
      });

      setCustomers(currentCustomers =>
        currentCustomers.map(item => (item.id === updatedCustomer.id ? updatedCustomer : item)),
      );

      setSaveSuccess('Customer updated successfully.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to update customer.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="px-6 py-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="text-sm font-medium text-gray-500">Caffeinawa Admin</p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Customers</h1>

          <p className="mt-3 text-gray-600">View and manage registered Caffeinawa customers.</p>
        </div>

        {saveSuccess && (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {saveSuccess}
          </div>
        )}

        {saveError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {isFetching ? (
            <div className="p-6">
              <p className="text-sm text-gray-600">Loading customers...</p>
            </div>
          ) : error ? (
            <div className="p-6">
              <p className="text-sm font-medium text-red-600">{error}</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="p-6">
              <p className="text-sm text-gray-600">No customers found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 font-medium text-gray-600">Name</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Email</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Role</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {customers.map(item => {
                    const isEditing = editingCustomerId === item.id;

                    return (
                      <tr key={item.id}>
                        <td className="px-6 py-4 align-top">
                          {isEditing ? (
                            <input
                              type="text"
                              value={form.name}
                              onChange={event =>
                                setForm(current => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                              aria-label="Customer name"
                            />
                          ) : (
                            <span className="font-medium text-gray-900">{item.name}</span>
                          )}
                        </td>

                        <td className="px-6 py-4 align-top">
                          {isEditing ? (
                            <input
                              type="email"
                              value={form.email}
                              onChange={event =>
                                setForm(current => ({
                                  ...current,
                                  email: event.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                              aria-label="Customer email"
                            />
                          ) : (
                            <span className="text-gray-600">{item.email}</span>
                          )}
                        </td>

                        <td className="px-6 py-4 align-top">
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                            {item.role}
                          </span>
                        </td>

                        <td className="px-6 py-4 align-top">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={handleSave}
                                disabled={isSaving}
                                className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isSaving ? 'Saving...' : 'Save'}
                              </button>

                              <button
                                type="button"
                                onClick={cancelEditing}
                                disabled={isSaving}
                                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditing(item)}
                              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
