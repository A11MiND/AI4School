import TeacherPaperManager from '../../../../components/TeacherPaperManager';

export default function TeacherReadingPapers() {
	return (
		<TeacherPaperManager
			paperType="reading"
			title="My Reading Papers"
			description="Manage your reading exam papers and assign them to classes."
			createHref="/teacher/create-paper"
			editHrefBuilder={(paperId) => `/teacher/create-paper?paperId=${paperId}`}
		/>
	);
}
