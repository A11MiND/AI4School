
import Link from 'next/link';

export default function WritingPaper() {
    return (
        <div className="flex h-screen items-center justify-center bg-gray-50 flex-col">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Writing Papers</h1>
            <p className="text-gray-500 mb-8">AI Grading for Writing is coming in the next version.</p>
            <Link href="/teacher/dashboard">
                <button className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition">
                    Back to Dashboard
                </button>
            </Link>
        </div>
    )
}
