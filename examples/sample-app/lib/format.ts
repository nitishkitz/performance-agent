import _ from 'lodash';

export function titleCase(value: string): string {
  return _.startCase(_.toLower(value));
}
