
function onlyUnique (value, index, self) {
  return self.indexOf(value) === index
}

const mapValue = (object, iteratee) => {
  object = Object(object)
  const result = {}

  Object.keys(object).forEach((key) => {
    const [newKey, value] = iteratee(object[key], key, object)
    if (typeof value !== 'undefined') result[newKey] = value
  })
  return result
}

const accumulatePackages = (dependencies, ignoreDev) => {
  if (typeof dependencies === 'undefined') {
    return {
      count: 0,
      accumulated: [],
      required: []
    }
  }

  const accumulated = mapValue(dependencies, ({ version, dev, requires, dependencies: childDependencies }, key) => {
    if (ignoreDev && dev) return [key, undefined]
    const result = accumulatePackages(childDependencies)
    const shared = result.required.length + Object.keys(requires || {}).length
    const required = Object.keys(requires || {}).concat(result.required).filter(onlyUnique)
    return [key, {
      ...result,
      shared: shared,
      required
    }]
  })

  const length = Object.keys(dependencies).length
  const count = Object.values(accumulated).reduce((accumulator, current) => accumulator + (current.count || 0), length)
  const required = [].concat(...Object.values(accumulated).map(x => x.required)).filter(onlyUnique)

  return {
    count: count,
    accumulated,
    required
  }
}

module.exports = async ({ dependencies, ignoreDev = false }) => {
  const result = accumulatePackages(dependencies, ignoreDev)
  const nice = Object.keys(result.accumulated).filter(name => !result.required.includes(name)).map(name => {
    const obj = result.accumulated[name]

    return {
      name,
      count: obj.count,
      shared: obj.shared
    }
  })

  return nice
}
