import { useAuthStore } from '../store/authStore';

export function SettingsPage() {
  const { user } = useAuthStore();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>
        <p className="text-gray-500 mt-1">Mandanten- und Benutzereinstellungen</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profil */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Mein Profil</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="font-medium">{user?.firstName} {user?.lastName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">E-Mail</span>
              <span className="font-medium">{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Rolle</span>
              <span className="font-medium">{user?.role}</span>
            </div>
          </div>
        </div>

        {/* Mandant */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Mandant</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Firmenname</span>
              <span className="font-medium">{user?.tenantName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Mandanten-ID</span>
              <span className="font-medium font-mono text-xs">{user?.tenantId}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
