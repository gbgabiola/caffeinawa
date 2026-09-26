'use client';

import { useEffect, useState } from 'react';
import type { Coffee, CoffeeCategory } from '@caffeinawa/types';

import { useAuth } from '@/components/auth/AuthProvider';
import { createAdminCoffee, deleteAdminCoffee, getAdminCoffees, updateAdminCoffee } from '@/lib/api/admin-coffees';

const COFFEE_CATEGORIES: CoffeeCategory[] = ['espresso', 'latte', 'cappuccino', 'americano', 'cold_brew', 'non_coffee'];

interface CoffeeFormState {
  name: string;
  description: string;
  category: CoffeeCategory;
  price: string;
  available: boolean;
  imageUrl: string;
}

const EMPTY_FORM: CoffeeFormState = {
  name: '',
  description: '',
  category: 'espresso',
  price: '',
  available: true,
  imageUrl: '',
};

export default function AdminCoffeesPage() {
  const { accessToken, customer, isLoading } = useAuth();

  const [coffees, setCoffees] = useState<Coffee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [isCreating, setIsCreating] = useState(false);
  const [editingCoffeeId, setEditingCoffeeId] = useState<string | null>(null);

  const [form, setForm] = useState<CoffeeFormState>(EMPTY_FORM);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [deletingCoffeeId, setDeletingCoffeeId] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !accessToken || customer?.role !== 'ADMIN') {
      return;
    }

    let cancelled = false;

    getAdminCoffees(accessToken)
      .then(data => {
        if (cancelled) {
          return;
        }

        setCoffees(data);
        setError(null);
        setFetchState('success');
      })
      .catch(error => {
        if (cancelled) {
          return;
        }

        setError(error instanceof Error ? error.message : 'Unable to load coffees.');
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

  function resetForm() {
    setForm(EMPTY_FORM);
    setIsCreating(false);
    setEditingCoffeeId(null);
    setSaveError(null);
    setSaveSuccess(null);
  }

  function startCreating() {
    setForm(EMPTY_FORM);
    setIsCreating(true);
    setEditingCoffeeId(null);
    setSaveError(null);
    setSaveSuccess(null);
  }

  function startEditing(coffee: Coffee) {
    setForm({
      name: coffee.name,
      description: coffee.description,
      category: coffee.category,
      price: String(coffee.price),
      available: coffee.available,
      imageUrl: coffee.imageUrl ?? '',
    });

    setEditingCoffeeId(coffee.id);
    setIsCreating(false);
    setSaveError(null);
    setSaveSuccess(null);
  }

  async function handleSave() {
    if (!accessToken) {
      return;
    }

    const name = form.name.trim();
    const description = form.description.trim();
    const imageUrl = form.imageUrl.trim();
    const price = Number(form.price);

    if (!name || !description) {
      setSaveError('Name and description are required.');
      setSaveSuccess(null);
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setSaveError('Price must be a valid non-negative number.');
      setSaveSuccess(null);
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      if (editingCoffeeId) {
        const updatedCoffee = await updateAdminCoffee(accessToken, editingCoffeeId, {
          name,
          description,
          category: form.category,
          price,
          available: form.available,
          ...(imageUrl ? { imageUrl } : {}),
        });

        setCoffees(current => current.map(item => (item.id === updatedCoffee.id ? updatedCoffee : item)));

        setSaveSuccess('Coffee updated successfully.');
      } else {
        const createdCoffee = await createAdminCoffee(accessToken, {
          name,
          description,
          category: form.category,
          price,
          available: form.available,
          ...(imageUrl ? { imageUrl } : {}),
        });

        setCoffees(current => [...current, createdCoffee]);
        setSaveSuccess('Coffee created successfully.');
        setForm(EMPTY_FORM);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save coffee.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(coffee: Coffee) {
    if (!accessToken) {
      return;
    }

    const confirmed = window.confirm(`Delete "${coffee.name}"? This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setDeletingCoffeeId(coffee.id);
    setError(null);

    try {
      await deleteAdminCoffee(accessToken, coffee.id);

      setCoffees(current => current.filter(item => item.id !== coffee.id));

      if (editingCoffeeId === coffee.id) {
        resetForm();
      }

      setSaveSuccess('Coffee deleted successfully.');
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to delete coffee.');
      setSaveSuccess(null);
    } finally {
      setDeletingCoffeeId(null);
    }
  }

  return (
    <div className="px-6 py-8 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-gray-500">Caffeinawa Admin</p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Coffee</h1>

            <p className="mt-3 text-gray-600">Create, edit, and manage the coffee menu.</p>
          </div>

          {!isCreating && !editingCoffeeId && (
            <button
              type="button"
              onClick={startCreating}
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700"
            >
              Add Coffee
            </button>
          )}
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

        {(isCreating || editingCoffeeId) && (
          <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingCoffeeId ? 'Edit Coffee' : 'Add Coffee'}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {editingCoffeeId ? 'Update the selected coffee.' : 'Add a new coffee to the menu.'}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="coffee-name" className="block text-sm font-medium text-gray-700">
                  Name
                </label>

                <input
                  id="coffee-name"
                  type="text"
                  value={form.name}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-500"
                />
              </div>

              <div>
                <label htmlFor="coffee-category" className="block text-sm font-medium text-gray-700">
                  Category
                </label>

                <select
                  id="coffee-category"
                  value={form.category}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      category: event.target.value as CoffeeCategory,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-500"
                >
                  {COFFEE_CATEGORIES.map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="coffee-price" className="block text-sm font-medium text-gray-700">
                  Price
                </label>

                <input
                  id="coffee-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      price: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-500"
                />
              </div>

              <div>
                <label htmlFor="coffee-image-url" className="block text-sm font-medium text-gray-700">
                  Image URL
                </label>

                <input
                  id="coffee-image-url"
                  type="url"
                  value={form.imageUrl}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      imageUrl: event.target.value,
                    }))
                  }
                  placeholder="https://..."
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-500"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="coffee-description" className="block text-sm font-medium text-gray-700">
                  Description
                </label>

                <textarea
                  id="coffee-description"
                  rows={4}
                  value={form.description}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-500"
                />
              </div>

              <label className="flex items-center gap-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.available}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      available: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />

                <span className="text-sm font-medium text-gray-700">Available for customers</span>
              </label>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : editingCoffeeId ? 'Save Changes' : 'Create Coffee'}
              </button>

              <button
                type="button"
                onClick={resetForm}
                disabled={isSaving}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {isFetching ? (
            <div className="p-6">
              <p className="text-sm text-gray-600">Loading coffees...</p>
            </div>
          ) : error ? (
            <div className="p-6">
              <p className="text-sm font-medium text-red-600">{error}</p>
            </div>
          ) : coffees.length === 0 ? (
            <div className="p-6">
              <p className="text-sm text-gray-600">No coffees found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 font-medium text-gray-600">Name</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Category</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Price</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Availability</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {coffees.map(coffee => (
                    <tr key={coffee.id}>
                      <td className="px-6 py-4 align-top">
                        <div>
                          <p className="font-medium text-gray-900">{coffee.name}</p>

                          <p className="mt-1 max-w-md text-xs text-gray-500">{coffee.description}</p>
                        </div>
                      </td>

                      <td className="px-6 py-4 align-top">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                          {coffee.category}
                        </span>
                      </td>

                      <td className="px-6 py-4 align-top font-medium text-gray-900">₱{coffee.price.toFixed(2)}</td>

                      <td className="px-6 py-4 align-top">
                        <span
                          className={
                            coffee.available
                              ? 'rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700'
                              : 'rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600'
                          }
                        >
                          {coffee.available ? 'Available' : 'Unavailable'}
                        </span>
                      </td>

                      <td className="px-6 py-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(coffee)}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(coffee)}
                            disabled={deletingCoffeeId === coffee.id}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingCoffeeId === coffee.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
