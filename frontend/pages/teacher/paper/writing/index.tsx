import TeacherPaperManager from '../../../../components/TeacherPaperManager';

export default function TeacherWritingPapers() {
    return (
        <TeacherPaperManager
            paperType="writing"
            title="My Writing Papers"
            description="Manage your writing exam papers and assign them to classes."
            createHref="/teacher/paper/writing/builder"
            editHrefBuilder={(paperId) => `/teacher/paper/writing/builder?paperId=${paperId}`}
        />
    );
}
