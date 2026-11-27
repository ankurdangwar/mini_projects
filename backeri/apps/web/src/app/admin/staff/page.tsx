'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { UserProfile } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

export default function AdminStaffPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'BAKER' as 'BAKER' | 'ADMIN',
  });
  const [createError, setCreateError] = useState('');
  const [saving, setSaving] = useState(false);

  // Password reset modal for staff
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const flash = (msg: string) => {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(null), 4000);
  };

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ staff: UserProfile[] }>('/api/v1/admin/staff');
      setStaff(res.staff);
    } catch (err) {
      console.error('Failed to load staff:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadStaff();
    } else {
      setLoading(false);
    }
  }, [user, loadStaff]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-700" />
        <h1 className="mt-3 font-serif text-2xl font-bold text-espresso">
          Admin Access Required
        </h1>
        <p className="mt-1 text-sm text-cocoa">
          Creating and disabling Baker or Admin staff accounts is restricted to the{' '}
          <strong>ADMIN</strong> role.
        </p>
      </div>
    );
  }

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setSaving(true);
    try {
      const res = await apiFetch<{ staff: UserProfile }>('/api/v1/admin/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: newStaff.name.trim(),
          email: newStaff.email.trim(),
          phone: newStaff.phone.trim() || undefined,
          password: newStaff.password,
          role: newStaff.role,
        }),
      });
      setCreateOpen(false);
      setNewStaff({ name: '', email: '', phone: '', password: '', role: 'BAKER' });
      flash(`Created ${res.staff.role} account for ${res.staff.name}.`);
      await loadStaff();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Failed to create staff account'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (member: UserProfile) => {
    const nextActive = member.isActive === false;
    try {
      await apiFetch(`/api/v1/admin/staff/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: nextActive }),
      });
      flash(
        `${member.name} has been ${
          nextActive ? 're-enabled' : 'disabled (active sessions revoked immediately)'
        }.`
      );
      await loadStaff();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleRoleToggle = async (member: UserProfile) => {
    const nextRole = member.role === 'ADMIN' ? 'BAKER' : 'ADMIN';
    if (!window.confirm(`Change ${member.name}'s role to ${nextRole}?`)) return;
    try {
      await apiFetch(`/api/v1/admin/staff/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      flash(`${member.name} is now ${nextRole}.`);
      await loadStaff();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Role change failed');
    }
  };

  const handleResetStaffPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || newPassword.length < 8) return;
    setSaving(true);
    try {
      await apiFetch(`/api/v1/admin/staff/${resetTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPassword }),
      });
      flash(`Updated password for ${resetTarget.name}.`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Password update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-espresso">
            Staff &amp; Role Management
          </h1>
          <p className="mt-0.5 text-xs text-cocoa">
            Create Baker &amp; Admin accounts, manage RBAC roles, reset staff
            passwords, or immediately disable access.
          </p>
        </div>

        <button
          onClick={() => {
            setCreateError('');
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-4 py-2.5 text-xs font-semibold text-white hover:bg-terracotta-dark"
        >
          <UserPlus className="h-4 w-4" />
          Add Baker / Admin
        </button>
      </div>

      {flashMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-sage/40 bg-sage/15 px-4 py-2.5 text-xs font-semibold text-espresso">
          <CheckCircle2 className="h-4 w-4 text-sage" />
          <span>{flashMsg}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-wheat bg-white shadow-xs">
        {loading ? (
          <p className="p-8 text-xs text-cocoa">Loading staff roster...</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-wheat bg-parchment/80 text-cocoa uppercase">
              <tr>
                <th className="px-5 py-3.5">Staff Member</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-wheat/70">
              {staff.map((member) => {
                const isSelf = member.id === user.id;
                const active = member.isActive !== false;
                return (
                  <tr
                    key={member.id}
                    className={active ? '' : 'bg-stone-50 opacity-70'}
                  >
                    <td className="px-5 py-4">
                      <p className="font-serif text-sm font-bold text-espresso">
                        {member.name}{' '}
                        {isSelf && (
                          <span className="ml-1 rounded bg-parchment px-1.5 py-0.5 font-sans text-[10px] font-semibold text-cocoa">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-cocoa">
                        {member.email} {member.phone ? `• ${member.phone}` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          member.role === 'ADMIN'
                            ? 'bg-espresso text-cream'
                            : 'bg-terracotta/15 text-terracotta'
                        }`}
                      >
                        <ShieldCheck className="h-3 w-3" />
                        {member.role}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          active
                            ? 'bg-sage/15 text-sage'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setResetTarget(member);
                            setNewPassword('');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-wheat bg-cream/60 px-2.5 py-1.5 font-semibold text-espresso hover:border-espresso"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset Password
                        </button>

                        {!isSelf && (
                          <>
                            <button
                              onClick={() => handleRoleToggle(member)}
                              className="rounded-lg border border-wheat px-2.5 py-1.5 font-semibold text-cocoa hover:border-espresso hover:text-espresso"
                            >
                              Make {member.role === 'ADMIN' ? 'Baker' : 'Admin'}
                            </button>

                            <button
                              onClick={() => handleToggleActive(member)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold ${
                                active
                                  ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                  : 'bg-sage text-white hover:opacity-95'
                              }`}
                            >
                              {active ? (
                                <>
                                  <UserX className="h-3.5 w-3.5" />
                                  Disable
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5" />
                                  Re-enable
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Staff Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/55 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-wheat bg-cream p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-wheat pb-3">
              <h2 className="font-serif text-xl font-bold text-espresso">
                Create Staff Account
              </h2>
              <button
                onClick={() => setCreateOpen(false)}
                className="rounded-full p-1 text-cocoa hover:bg-parchment"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="mt-4 space-y-3.5">
              <input
                type="text"
                required
                placeholder="Full Name *"
                value={newStaff.name}
                onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                className="w-full rounded-xl border border-wheat bg-white px-3.5 py-2.5 text-sm"
              />
              <input
                type="email"
                required
                placeholder="Work Email *"
                value={newStaff.email}
                onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                className="w-full rounded-xl border border-wheat bg-white px-3.5 py-2.5 text-sm"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={newStaff.phone}
                onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                className="w-full rounded-xl border border-wheat bg-white px-3.5 py-2.5 text-sm"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="Temporary Password (min 8 chars) *"
                value={newStaff.password}
                onChange={(e) =>
                  setNewStaff({ ...newStaff, password: e.target.value })
                }
                className="w-full rounded-xl border border-wheat bg-white px-3.5 py-2.5 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                {(['BAKER', 'ADMIN'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setNewStaff({ ...newStaff, role: r })}
                    className={`rounded-xl border py-2 text-xs font-bold ${
                      newStaff.role === r
                        ? 'border-espresso bg-espresso text-cream'
                        : 'border-wheat bg-white text-cocoa'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {createError && (
                <p className="text-xs font-medium text-red-600">{createError}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-terracotta py-3 text-sm font-semibold text-white hover:bg-terracotta-dark disabled:opacity-50"
              >
                {saving ? 'Creating...' : `Create ${newStaff.role} Account`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reset Staff Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/55 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-wheat bg-cream p-6 shadow-2xl">
            <h2 className="font-serif text-xl font-bold text-espresso">
              Reset Password
            </h2>
            <p className="mt-1 text-xs text-cocoa">
              Set a new password for <strong>{resetTarget.name}</strong> (
              {resetTarget.email}).
            </p>
            <form onSubmit={handleResetStaffPassword} className="mt-4 space-y-3">
              <input
                type="password"
                required
                minLength={8}
                placeholder="New password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-wheat bg-white px-3.5 py-2.5 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="rounded-xl border border-wheat bg-white px-4 py-2 text-xs font-semibold text-cocoa"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-terracotta px-4 py-2 text-xs font-semibold text-white"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
