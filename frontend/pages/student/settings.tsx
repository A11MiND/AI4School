import React from 'react';
import ProfileSettings from '../../components/ProfileSettings';
import Head from 'next/head';

const StudentSettings = () => {
  return (
    <>
      <Head>
        <title>Account Settings | AI4School</title>
      </Head>
      <ProfileSettings role="student" />
    </>
  );
};


export default StudentSettings;
