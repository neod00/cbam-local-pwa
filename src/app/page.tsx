export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-4 text-gray-600">Welcome to the CBAM Emission Calculation Platform.</p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: Overview */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-medium text-gray-900">Platform Status</h3>
          <p className="mt-2 text-sm text-gray-500">
            System is ready for data entry and calculation.
          </p>
          <div className="mt-4">
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
              Operational
            </span>
          </div>
        </div>

        {/* Card 2: Quick Links */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-500">
            <li>Register new HS72/73 Products</li>
            <li>Create a new Reporting Period</li>
            <li>Upload Activity Data (Excel)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
