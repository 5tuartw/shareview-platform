import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-beige flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-dark mb-4">
          ShareView Platform
        </h1>
        <p className="text-2xl text-gray-600 mb-8">
          Coming Soon
        </p>
        <Link
          href="/login"
          className="inline-block px-6 py-3 bg-gold text-dark font-semibold rounded-lg hover:bg-opacity-90 transition-all"
        >
          Login (Placeholder)
        </Link>
      </div>
    </div>
  );
}
