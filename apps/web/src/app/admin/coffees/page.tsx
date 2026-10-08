'use client';

import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import AdminListState from '@/components/admin/AdminListState';
import AdminListToolbar from '@/components/admin/AdminListToolbar';
import Pagination from '@/components/admin/Pagination';
import { useAuth } from '@/components/auth/AuthProvider';
import Dialog from '@/components/ui/Dialog';
import FormField from '@/components/ui/FormField';
import { ADMIN_PAGE_SIZE } from '@/constants/admin';
import { useAdminListQuery } from '@/hooks/useAdminListQuery';
import { useAdminListState } from '@/hooks/useAdminListState';
import { createAdminCoffee, deleteAdminCoffee, getAdminCoffees, updateAdminCoffee } from '@/lib/api/admin-coffees';

import type { Coffee, CoffeeCategory } from '@caffeinawa/types';

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
  const queryClient = useQueryClient();
  const { search, deferredSearch, setSearch, currentPage, setCurrentPage, resetPage } = useAdminListState();
  const [categoryFilter, setCategoryFilter] = useState<CoffeeCategory | ''>('');
  const [availableFilter, setAvailableFilter] = useState('');
  const {
    items: coffees,
    meta,
    error,
    status: fetchStatus,
  } = useAdminListQuery({
    accessToken,
    queryKey: [
      'admin',
      'coffees',
      {
        page: currentPage,
        pageSize: ADMIN_PAGE_SIZE,
        search: deferredSearch,
        category: categoryFilter,
        available: availableFilter,
      },
    ],
    queryFn: token =>
      getAdminCoffees(token, {
        page: currentPage,
        pageSize: ADMIN_PAGE_SIZE,
        search: deferredSearch,
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(availableFilter ? { available: availableFilter === 'true' } : {}),
      }),
  });
  const [isCreating, setIsCreating] = useState(false);
  const [editingCoffeeId, setEditingCoffeeId] = useState<string | null>(null);
  const [form, setForm] = useState<CoffeeFormState>(EMPTY_COFFEE_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [coffeePendingDeletion, setCoffeePendingDeletion] = useState<Coffee | null>(null);
  const [deletingCoffeeId, setDeletingCoffeeId] = useState<string | null>(null);

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
        await updateAdminCoffee(accessToken, editingCoffeeId, {
          name,
          description,
          category: form.category,
          price,
          available: form.available,
          imageUrl: imageUrl || undefined,
        });
        await queryClient.invalidateQueries({ queryKey: ['admin', 'coffees'] });
        setEditingCoffeeId(null);
        setForm(EMPTY_COFFEE_FORM);
        setSaveError(null);
        setSaveSuccess('Coffee updated successfully.');
      } else {
        await createAdminCoffee(accessToken, {
          name,
          description,
          category: form.category,
          price,
          available: form.available,
          ...(imageUrl ? { imageUrl } : {}),
        });

        await queryClient.invalidateQueries({ queryKey: ['admin', 'coffees'] });
        setIsCreating(false);
        setEditingCoffeeId(null);
        setForm(EMPTY_COFFEE_FORM);
        setSaveError(null);
        setSaveSuccess('Coffee created successfully.');
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
    setSaveError(null);
    setSaveSuccess(null);
    try {
      await deleteAdminCoffee(accessToken, coffee.id);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'coffees'] });
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
              <FormField htmlFor="coffee-name" label="Name">
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
              </FormField>

              <FormField htmlFor="coffee-category" label="Category">
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
              </FormField>

              <FormField htmlFor="coffee-price" label="Price">
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
              </FormField>

              <FormField htmlFor="coffee-image-url" label="Image URL">
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
              </FormField>

              <div className="md:col-span-2">
                <FormField htmlFor="coffee-description" label="Description">
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
                </FormField>
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
          <AdminListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by coffee name or description..."
          >
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Category</span>
              <select
                value={categoryFilter}
                onChange={event => {
                  setCategoryFilter(event.target.value as CoffeeCategory | '');
                  resetPage();
                }}
                className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">All categories</option>
                {COFFEE_CATEGORIES.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Availability</span>
              <select
                value={availableFilter}
                onChange={event => {
                  setAvailableFilter(event.target.value);
                  resetPage();
                }}
                className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">All</option>
                <option value="true">Available</option>
                <option value="false">Unavailable</option>
              </select>
            </label>
          </AdminListToolbar>
          <AdminListState
            status={fetchStatus}
            error={error}
            isEmpty={coffees.length === 0}
            loadingMessage="Loading coffees..."
            emptyMessage="No coffees found."
          >
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
                currentPage={meta?.page ?? currentPage}
                totalPages={meta?.totalPages ?? 1}
                totalItems={meta?.total ?? 0}
                pageSize={meta?.pageSize ?? ADMIN_PAGE_SIZE}
                onPageChange={setCurrentPage}
              />
            </div>
          </AdminListState>
        </div>
      </div>
      {coffeePendingDeletion && (
        <Dialog
          open={Boolean(coffeePendingDeletion)}
          onClose={() => setCoffeePendingDeletion(null)}
          title="Delete coffee?"
          description={
            coffeePendingDeletion
              ? `Are you sure you want to delete ${coffeePendingDeletion.name}? This action cannot be undone.`
              : undefined
          }
          closeDisabled={Boolean(deletingCoffeeId)}
        >
          <div className="flex justify-end gap-3">
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
        </Dialog>
      )}
    </div>
  );
}
