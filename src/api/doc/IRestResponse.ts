import http from "http";

/**
 * Endevor Rest API Response
 */
export interface IRestResponse {
	status: number | undefined;
	headers: http.IncomingHttpHeaders;
	size: number;
	body: any;
}