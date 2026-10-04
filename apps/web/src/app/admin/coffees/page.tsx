'use client';

import { useEffect, useState } from 'react';
import type { Coffee, CoffeeCategory } from '@caffeinawa/types';

import Pagination, { ADMIN_PAGE_SIZE } from '@/components/admin/Pagination';
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

const EMPTY_COFFEE_FORM: CoffeeFormState = {
  name: '',
  description: '',
  category: 'espresso',
  price: '',
  available: true,
  imageUrl: '',
};

const FORM_CONTROL_CLASS_NAME =
  'mt-2 w-full rounded-lg border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-gray-700 focus:ring-2 focus:ring-gray-200';

export default function AdminCoffeesPage() {
  const { accessToken } = useAuth();

  const [coffees, setCoffees] = useState<Coffee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [isCreating, setIsCreating] = useState(false);
  const [editingCoffeeId, setEditingCoffeeId] = useState<string | null>(null);
  const [form, setForm] = useState<CoffeeFormState>(EMPTY_COFFEE_FORM);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [coffeePendingDeletion, setCoffeePendingDeletion] = useState<Coffee | null>(null);
  const [deletingCoffeeId, setDeletingCoffeeId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      void getAdminCoffees(accessToken)
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
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!coffeePendingDeletion) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deletingCoffeeId) {
        setCoffeePendingDeletion(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [coffeePendingDeletion, deletingCoffeeId]);

  const isFetching = fetchState === 'idle' || fetchState === 'loading';

  const editingCoffee = coffees.find(coffee => coffee.id === editingCoffeeId);

  const hasChanges = editingCoffee
    ? form.name.trim() !== editingCoffee.name.trim() ||
      form.description.trim() !== editingCoffee.description.trim() ||
      form.category !== editingCoffee.category ||
      Number(form.price) !== editingCoffee.price ||
      form.available !== editingCoffee.available ||
      form.imageUrl.trim() !== (editingCoffee.imageUrl ?? '').trim()
    : false;

  function resetForm() {
    setForm(EMPTY_COFFEE_FORM);
    setIsCreating(false);
    setEditingCoffeeId(null);
    setSaveError(null);
    setSaveSuccess(null);
  }

  function startCreating() {
    setForm(EMPTY_COFFEE_FORM);
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

    if (editingCoffeeId && !hasChanges) {
      return;
    }

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
          imageUrl: imageUrl || undefined,
        });

        setCoffees(currentCoffees =>
          currentCoffees.map(coffee => (coffee.id === updatedCoffee.id ? updatedCoffee : coffee)),
        );

        setEditingCoffeeId(null);
        setForm(EMPTY_COFFEE_FORM);
        setSaveError(null);
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

        setCoffees(currentCoffees => [...currentCoffees, createdCoffee]);

        setSaveSuccess('Coffee created successfully.');
        setForm(EMPTY_COFFEE_FORM);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save coffee.');
    } finally {
      setIsSaving(false);
    }
  }

  function requestDelete(coffee: Coffee) {
    setCoffeePendingDeletion(coffee);
    setSaveError(null);
    setSaveSuccess(null);
  }

  async function confirmDelete() {
    if (!accessToken || !coffeePendingDeletion) {
      return;
    }

    const coffee = coffeePendingDeletion;

    setDeletingCoffeeId(coffee.id);
    setError(null);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      await deleteAdminCoffee(accessToken, coffee.id);

      setCoffees(currentCoffees => currentCoffees.filter(item => item.id !== coffee.id));

      if (editingCoffeeId === coffee.id) {
        resetForm();
      }

      setSaveSuccess('Coffee deleted successfully.');
      setCoffeePendingDeletion(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to delete coffee.');
    } finally {
      setDeletingCoffeeId(null);
    }
  }

  const totalPages = Math.ceil(coffees.length / ADMIN_PAGE_SIZE);
  const paginatedCoffees = coffees.slice((currentPage - 1) * ADMIN_PAGE_SIZE, currentPage * ADMIN_PAGE_SIZE);

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
                  className={FORM_CONTROL_CLASS_NAME}
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
                  className={FORM_CONTROL_CLASS_NAME}
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
                  className={FORM_CONTROL_CLASS_NAME}
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
                  className={FORM_CONTROL_CLASS_NAME}
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
                  className={FORM_CONTROL_CLASS_NAME}
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
                onClick={() => void handleSave()}
                disabled={isSaving || (Boolean(editingCoffeeId) && !hasChanges)}
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
                  {paginatedCoffees.map(coffee => (
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
                            onClick={() => requestDelete(coffee)}
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
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={coffees.length}
                pageSize={ADMIN_PAGE_SIZE}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      </div>
      {coffeePendingDeletion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="presentation"
          onClick={() => {
            if (!deletingCoffeeId) {
              setCoffeePendingDeletion(null);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-coffee-title"
            aria-describedby="delete-coffee-description"
            onClick={event => event.stopPropagation()}
          >
            <div>
              <h2 id="delete-coffee-title" className="text-lg font-semibold text-gray-900">
                Delete coffee?
              </h2>

              <p id="delete-coffee-description" className="mt-2 text-sm leading-6 text-gray-600">
                Are you sure you want to delete{' '}
                <span className="font-medium text-gray-900">{coffeePendingDeletion.name}</span>? This action cannot be
                undone.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCoffeePendingDeletion(null)}
                disabled={Boolean(deletingCoffeeId)}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmDelete}
                disabled={Boolean(deletingCoffeeId)}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingCoffeeId ? 'Deleting...' : 'Delete Coffee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
