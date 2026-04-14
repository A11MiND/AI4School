import TeacherPaperManager from '../../../components/TeacherPaperManager';

export default function TeacherListeningPapers() {
    return (
        <TeacherPaperManager
            paperType="listening"
            title="Listening Papers"
            description="Manage listening papers, assign classes, and monitor attempts."
            createHref="/teacher/paper/listening/builder"
            editHrefBuilder={(paperId) => `/teacher/paper/listening/builder?paperId=${paperId}`}
        />
    );
}
