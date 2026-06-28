import { HttpError } from "../lib/http-error.js";

export function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      throw new HttpError(
        422,
        "Please correct the highlighted information.",
        result.error.flatten(),
      );
    }

    req[source] = result.data;
    next();
  };
}
