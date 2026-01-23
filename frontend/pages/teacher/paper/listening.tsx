
import Link from 'next/link';
import { Headphones } from 'lucide-react';

export default function ListeningPaper() {
    return (
        <div className="flex h-screen items-center justify-center bg-gray-50 flex-col">
            <div className="bg-white p-6 rounded-full mb-6 shadow-sm">
                <Headphones size={48} className="text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Listening Papers</h1>
            <p className="text-gray-500 mb-8 max-w-md text-center">
                Audio upload and AI-generated listening comprehension questions will be available soon.
            </p>
            <Link href="/teacher/dashboard">
                <button className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition">
                    Back to Dashboard
                </button>
            </Link>
        </div>
    )
}
