'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, X } from 'lucide-react'
import { PerformanceTable } from '@/components/shared'
import type { Column } from '@/components/shared'
import type { RetailerListItem, UserResponse } from '@/types'

interface UserFormData {
  email: string
  full_name: string
  password: string
  role: string
  retailerIds: string[]
  username: string
}

interface ModalProps {
  isOpen: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}

function Modal({ isOpen, title, onClose, children }: ModalProps) {
  const modalRef = React.useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const focusableSelector =
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(focusableSelector)
    const firstElement = focusableElements?.[0]
    const lastElement = focusableElements?.[focusableElements.length - 1]

    firstElement?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key === 'Tab' && focusableElements && focusableElements.length > 0) {
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault()
          lastElement?.focus()
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault()
          firstElement?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full h-full sm:h-auto sm:max-w-2xl rounded-none sm:rounded-lg bg-white shadow-xl p-6 overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function SuperAdminUserManagement() {
  const [users, setUsers] = useState<UserResponse[]>([])
  const [retailers, setRetailers] = useState<RetailerListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null)
  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    full_name: '',
    password: '',
    role: 'CLIENT_VIEWER',
    retailerIds: [],
    username: '',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [confirmUser, setConfirmUser] = useState<UserResponse | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [usersResponse, retailersResponse] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/retailers'),
      ])

      if (!usersResponse.ok) {
        throw new Error('Failed to fetch users.')
      }
      if (!retailersResponse.ok) {
        throw new Error('Failed to fetch retailers.')
      }

      const usersData: UserResponse[] = await usersResponse.json()
      const retailersData: RetailerListItem[] = await retailersResponse.json()

      setUsers(usersData)
      setRetailers(retailersData)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!toastMessage) return

    const timeout = window.setTimeout(() => setToastMessage(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [toastMessage])

  const formatRole = (role: string) =>
    role
      .toLowerCase()
      .replace('_', ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())

  const formatDate = (value?: string) => {
    if (!value) return 'Never'
    const date = new Date(value)
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const openCreateModal = () => {
    setEditingUser(null)
    setFormErrors({})
    setFormData({
      email: '',
      full_name: '',
      password: '',
      role: 'CLIENT_VIEWER',
      retailerIds: [],
      username: '',
    })
    setIsModalOpen(true)
  }

  const openEditModal = (user: UserResponse) => {
    setEditingUser(user)
    setFormErrors({})
    setFormData({
      email: user.email,
      full_name: user.full_name || '',
      password: '',
      role: user.role,
      retailerIds: user.retailerAccess.map((access) => access.retailer_id),
      username: user.username || user.email,
    })
    setIsModalOpen(true)
  }

  const validateForm = () => {
    const nextErrors: Record<string, string> = {}

    if (!formData.email) {
      nextErrors.email = 'Email is required.'
    }
    if (!formData.role) {
      nextErrors.role = 'Role is required.'
    }
    if (!editingUser && !formData.password) {
      nextErrors.password = 'Password is required.'
    }

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSaveUser = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validateForm()) return

    setIsSaving(true)
    try {
      const payload = {
        email: formData.email,
        username: formData.username || formData.email,
        full_name: formData.full_name,
        role: formData.role,
        retailerIds: formData.retailerIds,
        ...(formData.password ? { password: formData.password } : {}),
      }

      const response = await fetch(editingUser ? `/api/users/${editingUser.id}` : '/api/users', {
        method: editingUser ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorResponse = await response.json().catch(() => ({ error: 'Unable to save user.' }))
        throw new Error(errorResponse.error || 'Unable to save user.')
      }

      await fetchData()
      setIsModalOpen(false)
      setToastMessage(editingUser ? 'User updated successfully.' : 'User created successfully.')
    } catch (saveError) {
      setFormErrors({ form: saveError instanceof Error ? saveError.message : 'Unable to save user.' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!confirmUser) return

    setDeletingUserId(confirmUser.id)
    try {
      const response = await fetch(`/api/users/${confirmUser.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const errorResponse = await response.json().catch(() => ({ error: 'Unable to delete user.' }))
        throw new Error(errorResponse.error || 'Unable to delete user.')
      }

      await fetchData()
      setToastMessage('User removed successfully.')
    } catch (deleteError) {
      setToastMessage(deleteError instanceof Error ? deleteError.message : 'Unable to delete user.')
    } finally {
      setDeletingUserId(null)
      setConfirmUser(null)
    }
  }

  const toggleRetailerAccess = (retailerIdValue: string) => {
    setFormData((prev) => {
      const exists = prev.retailerIds.includes(retailerIdValue)
      const nextRetailers = exists
        ? prev.retailerIds.filter((id) => id !== retailerIdValue)
        : [...prev.retailerIds, retailerIdValue]
      return { ...prev, retailerIds: nextRetailers }
    })
  }

  const columns: Column<UserResponse>[] = [
    {
      key: 'full_name',
      label: 'Name',
      sortable: true,
      render: (row: UserResponse) => (
        <div className="font-medium text-gray-900">{row.full_name || row.username}</div>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      sortable: true,
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (row: UserResponse) => (
        <span className="text-gray-700">{formatRole(row.role)}</span>
      ),
    },
    {
      key: 'last_login',
      label: 'Last Login',
      sortable: true,
      render: (row: UserResponse) => (
        <span className="text-gray-700">{formatDate(row.last_login)}</span>
      ),
    },
    {
      key: 'is_active',
      label: 'Status',
      sortable: true,
      render: (row: UserResponse) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
            row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (row: UserResponse) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => openEditModal(row)}
            className="text-blue-600 hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            aria-label={`Edit ${row.email}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmUser(row)}
            className="text-red-600 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            aria-label={`Remove ${row.email}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[240px]">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" aria-label="Loading users" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <button
          type="button"
          onClick={fetchData}
          className="px-4 py-2 text-sm font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-600">Manage all platform users.</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-[#1C1D1C] text-white text-sm font-semibold hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <PerformanceTable<UserResponse> data={users} columns={columns} pageSize={10} />
        {users.length === 0 && (
          <div className="px-6 py-4 text-sm text-gray-500">No users found.</div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? 'Edit User' : 'Add User'}
      >
        <form className="space-y-5" onSubmit={handleSaveUser}>
          {formErrors.form && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formErrors.form}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="user-email">
                Email
              </label>
              <input
                id="user-email"
                type="email"
                value={formData.email}
                onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
                aria-invalid={Boolean(formErrors.email)}
              />
              {formErrors.email && (
                <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="user-name">
                Name
              </label>
              <input
                id="user-name"
                type="text"
                value={formData.full_name}
                onChange={(event) => setFormData((prev) => ({ ...prev, full_name: event.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="user-role">
                Role
              </label>
              <select
                id="user-role"
                value={formData.role}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    role: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
                aria-invalid={Boolean(formErrors.role)}
              >
                <option value="CLIENT_VIEWER">Client Viewer</option>
                <option value="CLIENT_ADMIN">Client Admin</option>
                <option value="SALES_TEAM">Sales Team</option>
                <option value="CSS_ADMIN">CSS Admin</option>
              </select>
              {formErrors.role && (
                <p className="mt-1 text-xs text-red-600">{formErrors.role}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="user-password">
                Password
              </label>
              <input
                id="user-password"
                type="password"
                value={formData.password}
                onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
                placeholder={editingUser ? 'Leave blank to keep current password' : ''}
                aria-invalid={Boolean(formErrors.password)}
              />
              {formErrors.password && (
                <p className="mt-1 text-xs text-red-600">{formErrors.password}</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Retailer Access</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-3">
              {retailers.map((retailer) => (
                <label key={retailer.retailer_id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.retailerIds.includes(retailer.retailer_id)}
                    onChange={() => toggleRetailerAccess(retailer.retailer_id)}
                    className="h-4 w-4 rounded border-gray-300 accent-[#1C1D1C]"
                  />
                  <span>{retailer.retailer_name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold rounded-md bg-[#1C1D1C] text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save User'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(confirmUser)}
        onClose={() => setConfirmUser(null)}
        title="Remove User"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to remove {confirmUser?.email}? This cannot be undone.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmUser(null)}
              className="px-4 py-2 text-sm font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteUser}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              disabled={deletingUserId === confirmUser?.id}
            >
              {deletingUserId === confirmUser?.id ? 'Removing...' : 'Remove User'}
            </button>
          </div>
        </div>
      </Modal>

      {toastMessage && (
        <div
          className="fixed bottom-6 right-6 rounded-md bg-[#1C1D1C] px-4 py-2 text-sm text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      )}
    </div>
  )
}
