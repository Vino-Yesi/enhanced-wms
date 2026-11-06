declare module 'jsbarcode' {
  interface JsBarcodeOptions {
    format?: string;
    width?: number;
    height?: number;
    displayValue?: boolean;
    font?: string;
    text?: string;
    textAlign?: string;
    textPosition?: string;
    textMargin?: number;
    fontSize?: number;
    background?: string;
    lineColor?: string;
    margin?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    valid?: (valid: boolean) => void;
    [key: string]: unknown;
  }
  function JsBarcode(
    selector: string | HTMLCanvasElement | SVGSVGElement,
    data: string,
    options?: JsBarcodeOptions
  ): void;
  export default JsBarcode;
}
