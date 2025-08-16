import * as axios from 'axios';
import * as JSONBig from 'json-bigint';

export const axiosInstance = axios.default.create({
  transformResponse: [
    (data) => {
      try {
        return JSONBig({ storeAsString: true }).parse(data);
      } catch (e) {
        return data;
      }
    },
  ],
});
