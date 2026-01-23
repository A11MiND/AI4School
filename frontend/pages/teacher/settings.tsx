import React from 'react';
import Layout from '../../components/Layout';
import ProfileSettings from '../../components/ProfileSettings';
import Head from 'next/head';

const TeacherSettings = () => {
  return (
    <Layout>
      <Head>
        <title>Account Settings | AI4School</title>
      </Head>
      <ProfileSettings role="teacher" />
    </Layout>
  );
};

export default TeacherSettings;
