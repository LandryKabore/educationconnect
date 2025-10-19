import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
  Section,
} from 'npm:@react-email/components@0.0.22';
import * as React from 'npm:react@18.3.1';

interface AdminInvitationEmailProps {
  adminName: string;
  schoolName: string;
  setupLink: string;
}

export const AdminInvitationEmail = ({
  adminName,
  schoolName,
  setupLink,
}: AdminInvitationEmailProps) => (
  <Html>
    <Head />
    <Preview>Set up your school administrator account for {schoolName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to the School Management System!</Heading>
        
        <Text style={text}>
          Hello {adminName},
        </Text>
        
        <Text style={text}>
          You have been invited to become a School Administrator for <strong>{schoolName}</strong>.
        </Text>
        
        <Text style={text}>
          As a school administrator, you will be able to:
        </Text>
        
        <ul style={list}>
          <li>Manage teachers and students</li>
          <li>Create and organize classes</li>
          <li>Monitor academic performance</li>
          <li>Generate reports and analytics</li>
        </ul>
        
        <Section style={buttonContainer}>
          <Link
            href={setupLink}
            target="_blank"
            style={button}
          >
            Set Up Your Account
          </Link>
        </Section>
        
        <Text style={{ ...text, marginTop: '24px' }}>
          This link will expire in 24 hours for security reasons.
        </Text>
        
        <Text style={{ ...text, color: '#666', marginTop: '20px' }}>
          If you didn't expect this invitation, you can safely ignore this email.
        </Text>
        
        <Text style={footer}>
          School Management System
        </Text>
      </Container>
    </Body>
  </Html>
);

export default AdminInvitationEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '580px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0 40px',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  padding: '0 40px',
};

const list = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  paddingLeft: '60px',
  marginTop: '12px',
};

const buttonContainer = {
  padding: '27px 40px',
};

const button = {
  backgroundColor: '#5469d4',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 20px',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  padding: '0 40px',
  marginTop: '32px',
};
