import TeacherPaperManager from '../../../components/TeacherPaperManager';

export default function TeacherSpeakingPapers() {
    return (
        <TeacherPaperManager
            paperType="speaking"
            title="Speaking Papers"
            description="Manage speaking scenarios and assign oral sessions to classes."
            createHref="/teacher/paper/speaking/builder"
            editHrefBuilder={(paperId) => `/teacher/paper/speaking/builder?paperId=${paperId}`}
        />
    );
}
