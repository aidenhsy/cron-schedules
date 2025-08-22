export class SendMailDto {
  to: string;
  subject: string;
  text: string;
  attachments: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[];
}
