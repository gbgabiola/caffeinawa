'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/components/auth/AuthProvider';
import { getAdminCustomers, updateAdminCustomer, type AdminCustomer } from '@/lib/api/admin-customers';

interface CustomerFormState {
  name: string;
  email: string;
}

const EMPTY_CUSTOMER_FORM: CustomerFormState = {
  name: '',
  email: '',
};

export default function AdminCustomersPage() {
  const { accessToken } = useAuth();

  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormState>(EMPTY_CUSTOMER_FORM);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      void getAdminCustomers(accessToken)
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
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const isFetching = fetchState === 'idle' || fetchState === 'loading';

  const editingCustomer = customers.find(customer => customer.id === editingCustomerId);

  const hasChanges = editingCustomer
    ? form.name.trim() !== editingCustomer.name.trim() || form.email.trim() !== editingCustomer.email.trim()
    : false;

  function startEditing(customer: AdminCustomer) {
    setEditingCustomerId(customer.id);
    setForm({
      name: customer.name,
      email: customer.email,
    });
    setSaveError(null);
    setSaveSuccess(null);
  }

  function cancelEditing() {
    setEditingCustomerId(null);
    setForm(EMPTY_CUSTOMER_FORM);
    setSaveError(null);
    setSaveSuccess(null);
  }

  async function handleSave() {
    if (!accessToken || !editingCustomerId || !hasChanges) {
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
        currentCustomers.map(customer => (customer.id === updatedCustomer.id ? updatedCustomer : customer)),
      );

      setEditingCustomerId(null);
      setForm(EMPTY_CUSTOMER_FORM);
      setSaveError(null);
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
                  {customers.map(customer => {
                    const isEditing = editingCustomerId === customer.id;

                    return (
                      <tr key={customer.id}>
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
                              className="w-full rounded-lg border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-gray-700 focus:ring-2 focus:ring-gray-200"
                              aria-label="Customer name"
                            />
                          ) : (
                            <span className="font-medium text-gray-900">{customer.name}</span>
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
                              className="w-full rounded-lg border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-gray-700 focus:ring-2 focus:ring-gray-200"
                              aria-label="Customer email"
                            />
                          ) : (
                            <span className="text-gray-600">{customer.email}</span>
                          )}
                        </td>

                        <td className="px-6 py-4 align-top">
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                            {customer.role}
                          </span>
                        </td>

                        <td className="px-6 py-4 align-top">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleSave()}
                                disabled={isSaving || !hasChanges}
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
                              onClick={() => startEditing(customer)}
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
