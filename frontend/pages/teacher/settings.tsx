import React from 'react';
import ProfileSettings from '../../components/ProfileSettings';
import Head from 'next/head';

const TeacherSettings = () => {
  return (
    <>
      <Head>
        <title>Account Settings | AI4School</title>
      </Head>
      <ProfileSettings role="teacher" />
    </>
  );
};


export default TeacherSettings;
